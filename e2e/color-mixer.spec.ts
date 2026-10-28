import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';

const video = fileURLToPath(new URL('./fixtures/test-video.webm', import.meta.url));
const cycle = fileURLToPath(new URL('./fixtures/channel-cycle.cube', import.meta.url));
const bands = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'];
const palette = [
  [255, 0, 0],
  [255, 128, 0],
  [255, 255, 0],
  [0, 255, 0],
  [0, 255, 255],
  [0, 0, 255],
  [128, 0, 255],
  [255, 0, 255],
  [128, 128, 128],
  [128, 129, 128],
  [0, 0, 0],
  [255, 255, 255],
  [255, 0, 0],
  [255, 0, 4],
  [255, 4, 0],
  [0, 3, 0],
];

test.beforeEach(async ({ page }) => {
  // Substitute a known color chart at the upload boundary. The real WebGL
  // renderer, shader, LUT texture and video lifecycle still run unchanged.
  await page.addInitScript((colors) => {
    const chart = document.createElement('canvas');
    const context = chart.getContext('2d')!;
    const frame = (source: HTMLVideoElement) => {
      if (chart.width !== source.videoWidth || chart.height !== source.videoHeight) {
        chart.width = source.videoWidth;
        chart.height = source.videoHeight;
        colors.forEach((rgb, index) => {
          context.fillStyle = `rgb(${rgb.join(',')})`;
          const left = Math.floor((index * chart.width) / colors.length);
          const right = Math.floor(((index + 1) * chart.width) / colors.length);
          context.fillRect(left, 0, right - left, chart.height);
        });
      }
      return chart;
    };
    const image = WebGL2RenderingContext.prototype.texImage2D;
    const update = WebGL2RenderingContext.prototype.texSubImage2D;
    WebGL2RenderingContext.prototype.texImage2D = function (...args: unknown[]) {
      if (args.at(-1) instanceof HTMLVideoElement)
        args[args.length - 1] = frame(args.at(-1) as HTMLVideoElement);
      return Reflect.apply(image, this, args);
    };
    WebGL2RenderingContext.prototype.texSubImage2D = function (...args: unknown[]) {
      if (args.at(-1) instanceof HTMLVideoElement)
        args[args.length - 1] = frame(args.at(-1) as HTMLVideoElement);
      return Reflect.apply(update, this, args);
    };
  }, palette);
  await page.goto('/');
  await loadVideo(page);
});

async function loadVideo(page: Page) {
  await page.getByLabel('Choose video file', { exact: true }).setInputFiles(video);
  await expect(page.locator('canvas.video-canvas')).toHaveAttribute('data-renderer', 'webgl2');
}
async function openMixer(page: Page) {
  const mixer = page.locator('details[data-group="mixer"]');
  if (!(await mixer.evaluate((element) => (element as HTMLDetailsElement).open)))
    await mixer.locator('summary').click();
}
async function pixels(page: Page): Promise<number[][]> {
  return page.locator('canvas.video-canvas').evaluate((element, count) => {
    document.querySelector('video')!.dispatchEvent(new Event('seeked'));
    const canvas = element as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2')!;
    return Array.from({ length: count }, (_, index) => {
      const pixel = new Uint8Array(4);
      gl.readPixels(
        Math.floor(((index + 0.5) * canvas.width) / count),
        Math.floor(canvas.height / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel,
      );
      return Array.from(pixel.slice(0, 3));
    });
  }, palette.length);
}
function closeColor(actual: number[], expected: number[], tolerance = 2) {
  actual.forEach((value, channel) =>
    expect(Math.abs(value - expected[channel])).toBeLessThanOrEqual(tolerance),
  );
}

test('edits all eight ranges independently and protects neutrals in the GPU preview', async ({
  page,
}) => {
  const baseline = await pixels(page);
  baseline.forEach((rgb, index) => closeColor(rgb, palette[index]));
  await openMixer(page);
  for (const [index, band] of bands.entries()) {
    await page.getByRole('button', { name: `${band} color range`, exact: true }).click();
    await page.getByRole('slider', { name: `${band} saturation`, exact: true }).press('Home');
    const edited = await pixels(page);
    closeColor(edited[index], [128, 128, 128]);
    for (let other = 0; other < 8; other++)
      if (other !== index) closeColor(edited[other], baseline[other]);
    for (let neutral = 8; neutral <= 11; neutral++) closeColor(edited[neutral], baseline[neutral]);
    closeColor(edited[15], baseline[15]);
    await page.getByRole('button', { name: `Reset color: ${band}`, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Green color range', exact: true }).click();
  await page.getByRole('slider', { name: 'Green hue', exact: true }).press('End');
  closeColor((await pixels(page))[3], [0, 255, 128]);
  await page.getByRole('slider', { name: 'Green luminance', exact: true }).press('Home');
  closeColor((await pixels(page))[3], [0, 0, 0]);
  await page.getByRole('button', { name: 'Reset color: Green', exact: true }).click();
  await page.getByRole('slider', { name: 'Green luminance', exact: true }).press('End');
  closeColor((await pixels(page))[3], [255, 255, 255]);
  await page.getByRole('button', { name: 'Reset color: Green', exact: true }).click();
  await page.getByRole('button', { name: 'Red color range', exact: true }).click();
  await page.getByRole('slider', { name: 'Red hue', exact: true }).press('End');
  const redSeam = await pixels(page);
  // Inputs are on opposite sides of red. Their small difference remains
  // continuous after a 30-degree shift; it is not a discontinuity at 0/360.
  closeColor(redSeam[13], [255, 123, 0]);
  closeColor(redSeam[14], [255, 131, 0]);
});

test('applies the mixer after the LUT and preserves LUT settings during Reset and Undo', async ({
  page,
}) => {
  await page.getByLabel('Choose LUT file', { exact: true }).setInputFiles(cycle);
  await openMixer(page);
  await page.getByRole('button', { name: 'Blue color range', exact: true }).click();
  await page.getByRole('slider', { name: 'Blue saturation', exact: true }).press('Home');
  const edited = await pixels(page);
  closeColor(edited[0], [128, 128, 128]); // Original red becomes blue through the LUT, then desaturates.
  closeColor(edited[3], [255, 0, 0]); // Original green becomes red, outside the blue range.
  await page.getByRole('button', { name: 'Compare before and after', exact: true }).click();
  const comparison = await pixels(page);
  closeColor(comparison[0], palette[0]);
  closeColor(comparison[12], [128, 128, 128]);
  await page.getByRole('button', { name: 'Compare before and after', exact: true }).click();
  const intensity = page.getByRole('slider', { name: 'LUT intensity', exact: true });
  await intensity.press('PageDown');
  await page.getByRole('button', { name: 'Enable LUT', exact: true }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Blue saturation', exact: true })).toHaveValue('0');
  await expect(intensity).toHaveValue('90');
  await expect(page.getByRole('button', { name: 'Enable LUT', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Channel cycle');
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(page.getByRole('slider', { name: 'Blue saturation', exact: true })).toHaveValue(
    '-100',
  );
});

test('keeps mixer selection outside history, groups gestures and supports folding, keyboard and new sessions', async ({
  page,
}) => {
  await openMixer(page);
  const green = page.getByRole('button', { name: 'Green color range', exact: true });
  await green.focus();
  await green.press('Space');
  await expect(green).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
  const slider = page.getByRole('slider', { name: 'Green saturation', exact: true });
  await slider.focus();
  await page.keyboard.down('ArrowLeft');
  for (let index = 0; index < 9; index++) await page.keyboard.down('ArrowLeft');
  await page.keyboard.up('ArrowLeft');
  await expect(slider).toHaveValue('-10');
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(slider).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
  await page.getByRole('button', { name: 'Redo adjustment' }).click();
  await expect(slider).toHaveValue('-10');
  const mixer = page.locator('details[data-group="mixer"]');
  await mixer.locator('summary').click();
  await expect(mixer.locator('summary')).toContainText('1 edited');
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(mixer).not.toHaveAttribute('open');
  await openMixer(page);
  await expect(green).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('video').evaluate((element: HTMLVideoElement) => element.paused)).toBe(
    true,
  );
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations).toEqual([]);
  await loadVideo(page);
  await openMixer(page);
  await expect(page.getByRole('button', { name: 'Red color range', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('slider', { name: 'Red hue', exact: true })).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
});

test('restores color mixer settings and pixels after losing the graphics context', async ({
  page,
}) => {
  await openMixer(page);
  await page.getByRole('button', { name: 'Green color range', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Green saturation', exact: true });
  await slider.press('Home');
  const before = await pixels(page);
  const canvas = page.locator('canvas.video-canvas');
  const extension = await canvas.evaluateHandle((element) =>
    (element as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!,
  );
  await extension.evaluate((context) => context.loseContext());
  await expect(canvas).toHaveAttribute('data-renderer', 'css');
  await expect(slider).toBeDisabled();
  await expect(slider).toHaveValue('-100');
  await extension.evaluate((context) => context.restoreContext());
  await expect(canvas).toHaveAttribute('data-renderer', 'webgl2');
  await expect(slider).toBeEnabled();
  expect(await pixels(page)).toEqual(before);
});
