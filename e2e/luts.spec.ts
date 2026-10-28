import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';

const videoFile = fileURLToPath(new URL('./fixtures/test-video.webm', import.meta.url));
const cycleFile = fileURLToPath(new URL('./fixtures/channel-cycle.cube', import.meta.url));
const identityFile = fileURLToPath(new URL('./fixtures/identity.cube', import.meta.url));

async function loadVideo(page: Page) {
  await page.getByLabel('Choose video file', { exact: true }).setInputFiles(videoFile);
  await expect(page.locator('canvas.video-canvas')).toHaveAttribute('data-renderer', 'webgl2');
}
async function loadLut(page: Page, file = cycleFile, name = 'Channel cycle') {
  await page.getByLabel('Choose LUT file', { exact: true }).setInputFiles(file);
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText(name);
  await expect(page.getByRole('slider', { name: 'LUT intensity', exact: true })).toHaveValue('100');
}

async function pixelError(
  page: Page,
  amount: number,
  split = 0,
  filter = 'none',
  transform = 'cycle',
) {
  return page.locator('canvas.video-canvas').evaluate(
    (element, options) => {
      const canvas = element as HTMLCanvasElement;
      const video = document.querySelector('video')!;
      video.dispatchEvent(new Event('seeked'));
      const gl = canvas.getContext('webgl2')!;
      const output = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, output);
      const reference = document.createElement('canvas');
      reference.width = canvas.width;
      reference.height = canvas.height;
      const context = reference.getContext('2d')!;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const original = context.getImageData(0, 0, canvas.width, canvas.height).data;
      context.filter = options.filter;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const adjusted = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let maximum = 0;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++) {
          const index = (y * canvas.width + x) * 4;
          const originalSide = (x + 0.5) / canvas.width < options.split / 100;
          for (let channel = 0; channel < 3; channel++) {
            const input = adjusted[index + channel];
            let mapped =
              options.transform === 'identity' ? input : adjusted[index + ((channel + 1) % 3)];
            if (options.transform === 'extended') mapped = input * 1.5 - 255 * 0.25;
            if (options.transform === 'nonlinear') {
              const lower = [0.1, 0.2, 0.3][channel];
              const upper = [0.9, 0.8, 0.7][channel];
              const coordinate =
                Math.min(1, Math.max(0, (input / 255 - lower) / (upper - lower))) * 32;
              const left = Math.floor(coordinate);
              const right = Math.min(32, left + 1);
              const fraction = coordinate - left;
              mapped = 255 * ((left / 32) ** 2 * (1 - fraction) + (right / 32) ** 2 * fraction);
            }
            const mixed = originalSide
              ? original[index + channel]
              : input * (1 - options.amount) + mapped * options.amount;
            const expected = Math.max(0, Math.min(255, mixed));
            const actual = output[((canvas.height - 1 - y) * canvas.width + x) * 4 + channel];
            maximum = Math.max(maximum, Math.abs(actual - expected));
          }
        }
      return { maximum, error: gl.getError() };
    },
    { amount, split, filter, transform },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('imports a 65-point LUT larger than 4 MiB and preserves identity colors', async ({ page }) => {
  await loadVideo(page);
  const lines = ['TITLE "Large identity"', 'LUT_3D_SIZE 65'];
  for (let blue = 0; blue < 65; blue++)
    for (let green = 0; green < 65; green++)
      for (let red = 0; red < 65; red++)
        lines.push(`${(red / 64).toFixed(6)} ${(green / 64).toFixed(6)} ${(blue / 64).toFixed(6)}`);
  const buffer = Buffer.from(lines.join('\n'));
  expect(buffer.byteLength).toBeGreaterThan(4 * 1024 * 1024);
  expect(buffer.byteLength).toBeLessThanOrEqual(8 * 1024 * 1024);
  await page
    .getByLabel('Choose LUT file', { exact: true })
    .setInputFiles({ name: 'large-identity.cube', mimeType: 'text/plain', buffer });
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Large identity');
  const result = await pixelError(page, 1, 0, 'none', 'identity');
  expect(result.error).toBe(0);
  expect(result.maximum).toBeLessThanOrEqual(2);
});

test('keeps negative and above-one entries through interpolation and intensity before clamping final pixels', async ({
  page,
}) => {
  await loadVideo(page);
  const lines = ['TITLE "Extended range"', 'LUT_3D_SIZE 2'];
  for (let blue = 0; blue < 2; blue++)
    for (let green = 0; green < 2; green++)
      for (let red = 0; red < 2; red++)
        lines.push(`${red * 1.5 - 0.25} ${green * 1.5 - 0.25} ${blue * 1.5 - 0.25}`);
  await page.getByLabel('Choose LUT file', { exact: true }).setInputFiles({
    name: 'extended.cube',
    mimeType: 'text/plain',
    buffer: Buffer.from(lines.join('\n')),
  });
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Extended range');
  expect((await pixelError(page, 1, 0, 'none', 'extended')).maximum).toBeLessThanOrEqual(3);
  const intensity = page.getByRole('slider', { name: 'LUT intensity', exact: true });
  await intensity.focus();
  for (let index = 0; index < 5; index++) await intensity.press('PageDown');
  await expect(intensity).toHaveValue('50');
  expect((await pixelError(page, 0.5, 0, 'none', 'extended')).maximum).toBeLessThanOrEqual(3);
  await page.getByRole('button', { name: 'Compare before and after', exact: true }).click();
  expect((await pixelError(page, 0.5, 50, 'none', 'extended')).maximum).toBeLessThanOrEqual(3);
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(intensity).toHaveValue('60');
  await page.getByRole('button', { name: 'Redo adjustment' }).click();
  await expect(intensity).toHaveValue('50');
});

test('samples a 33-point nonlinear LUT with independent input domains for each channel', async ({
  page,
}) => {
  await loadVideo(page);
  const lines = [
    'TITLE "Nonlinear domain"',
    'LUT_3D_SIZE 33',
    'DOMAIN_MIN 0.1 0.2 0.3',
    'DOMAIN_MAX 0.9 0.8 0.7',
  ];
  for (let blue = 0; blue < 33; blue++)
    for (let green = 0; green < 33; green++)
      for (let red = 0; red < 33; red++)
        lines.push(`${(red / 32) ** 2} ${(green / 32) ** 2} ${(blue / 32) ** 2}`);
  await page.getByLabel('Choose LUT file', { exact: true }).setInputFiles({
    name: 'nonlinear.cube',
    mimeType: 'text/plain',
    buffer: Buffer.from(lines.join('\n')),
  });
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Nonlinear domain');
  const result = await pixelError(page, 1, 0, 'none', 'nonlinear');
  expect(result.error).toBe(0);
  expect(result.maximum).toBeLessThanOrEqual(3);
});

test('renders identity and channel mapping with interpolation, intensity and original comparison', async ({
  page,
}) => {
  await loadVideo(page);
  await loadLut(page, identityFile, 'Identity');
  expect((await pixelError(page, 1, 0, 'none', 'identity')).maximum).toBeLessThanOrEqual(2);
  await loadLut(page);
  const full = await pixelError(page, 1);
  expect(full.error).toBe(0);
  expect(full.maximum).toBeLessThanOrEqual(3);
  const intensity = page.getByRole('slider', { name: 'LUT intensity', exact: true });
  await intensity.focus();
  await intensity.press('Home');
  expect((await pixelError(page, 0)).maximum).toBeLessThanOrEqual(2);
  await intensity.press('End');
  for (let i = 0; i < 5; i++) await intensity.press('PageDown');
  await expect(intensity).toHaveValue('50');
  expect((await pixelError(page, 0.5)).maximum).toBeLessThanOrEqual(3);
  await page.getByRole('button', { name: 'Compare before and after', exact: true }).click();
  expect((await pixelError(page, 0.5, 50)).maximum).toBeLessThanOrEqual(3);
  await page.getByRole('slider', { name: 'Before and after split', exact: true }).press('End');
  expect((await pixelError(page, 0.5, 100)).maximum).toBeLessThanOrEqual(2);
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations).toEqual([]);
});

test('preserves LUT with presets and groups intensity history with replacement, removal and reset', async ({
  page,
}) => {
  await loadVideo(page);
  await loadLut(page);
  const intensity = page.getByRole('slider', { name: 'LUT intensity', exact: true });
  await intensity.focus();
  await page.keyboard.down('ArrowLeft');
  for (let i = 0; i < 19; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('ArrowLeft');
  // Use a real pointer gesture to check one history entry for many input events.
  const box = (await intensity.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const value = await intensity.inputValue();
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(intensity).toHaveValue('80');
  await page.getByRole('button', { name: 'Redo adjustment' }).click();
  await expect(intensity).toHaveValue(value);
  await page.getByRole('button', { name: 'Cinematic', exact: true }).click();
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Channel cycle');
  expect(
    (
      await pixelError(
        page,
        Number(value) / 100,
        0,
        'brightness(105%) contrast(115%) saturate(85%)',
      )
    ).maximum,
  ).toBeLessThanOrEqual(4);
  await page.getByRole('button', { name: 'Enable LUT', exact: true }).click();
  await expect(intensity).toBeDisabled();
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(intensity).toBeEnabled();
  await loadLut(page, identityFile, 'Identity');
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Channel cycle');
  await expect(intensity).toHaveValue(value);
  await page.getByRole('button', { name: 'Remove selected LUT', exact: true }).click();
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Identity');
  await expect(
    page.getByRole('button', { name: 'Select LUT: Channel cycle', exact: true }),
  ).toHaveCount(0);
  await expect(intensity).toHaveValue(value);
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Channel cycle');
  await expect(intensity).toHaveValue(value);
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('100');
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Channel cycle');
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('105');
});

test('rejects unsupported LUTs and preserves the current look without uploading or storing the file', async ({
  page,
}) => {
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && request.method() !== 'GET') uploads.push(request.url());
  });
  await loadVideo(page);
  await loadLut(page);
  const input = page.getByLabel('Choose LUT file', { exact: true });
  for (const [name, content, message] of [
    ['broken.cube', 'LUT_3D_SIZE 33\n0 0 0', 'exactly'],
    ['one-dimensional.cube', 'LUT_1D_SIZE 2\n0 0 0\n1 1 1', '1D and combined'],
    ['large-grid.cube', 'LUT_3D_SIZE 66', '2–65'],
    ['overflow.cube', 'LUT_3D_SIZE 2\n65505 0 0', '65504'],
    ['wrong.txt', 'LUT_3D_SIZE 2', 'Choose a .cube'],
    ['too-big.cube', ' '.repeat(8 * 1024 * 1024 + 1), '8 MiB'],
  ]) {
    await input.setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Channel cycle');
    expect((await pixelError(page, 1)).maximum).toBeLessThanOrEqual(3);
  }
  await loadLut(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(uploads).toEqual([]);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key !== 'cliplab.shortcuts.v1'),
    ),
  ).toEqual([]);
  await page.reload();
  await expect(page.getByText('No LUT active.', { exact: true })).toBeAttached();
});

test('restores the LUT after GPU loss and releases the old texture on video replacement', async ({
  page,
}) => {
  await loadVideo(page);
  await loadLut(page);
  const canvas = page.locator('canvas.video-canvas');
  const oldCanvas = (await canvas.elementHandle())!;
  const oldTexture = await oldCanvas.evaluateHandle((element) => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2')!;
    gl.activeTexture(gl.TEXTURE1);
    return gl.getParameter(gl.TEXTURE_BINDING_3D) as WebGLTexture;
  });
  const extension = await canvas.evaluateHandle((element) =>
    (element as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!,
  );
  await extension.evaluate((context) => context.loseContext());
  await expect(canvas).toHaveAttribute('data-renderer', 'css');
  await expect(page.getByRole('slider', { name: 'LUT intensity', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Load LUTs', exact: true })).toBeDisabled();
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Channel cycle');
  await extension.evaluate((context) => context.restoreContext());
  await expect(canvas).toHaveAttribute('data-renderer', 'webgl2');
  expect((await pixelError(page, 1)).maximum).toBeLessThanOrEqual(3);
  // Capture the restored context's texture, as loss already invalidated the first one.
  await oldTexture.dispose();
  const restoredTexture = await oldCanvas.evaluateHandle((element) => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2')!;
    gl.activeTexture(gl.TEXTURE1);
    return gl.getParameter(gl.TEXTURE_BINDING_3D) as WebGLTexture;
  });
  await loadVideo(page);
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
  expect(
    await oldCanvas.evaluate(
      (element, texture) => (element as HTMLCanvasElement).getContext('webgl2')!.isTexture(texture),
      restoredTexture,
    ),
  ).toBe(false);
  await restoredTexture.dispose();
  await oldCanvas.dispose();
  await extension.dispose();
});

test('uploads LUT data only when its source changes, while intensity changes redraw paused frames', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.texImage3D;
    Object.assign(window, { lutUploads: 0 });
    WebGL2RenderingContext.prototype.texImage3D = function (
      this: WebGL2RenderingContext,
      ...args: Parameters<typeof original>
    ) {
      Object.assign(window, {
        lutUploads: (window as unknown as { lutUploads: number }).lutUploads + 1,
      });
      return original.apply(this, args);
    } as typeof original;
  });
  await page.reload();
  await loadVideo(page);
  await loadLut(page);
  const count = () => page.evaluate(() => (window as unknown as { lutUploads: number }).lutUploads);
  expect(await count()).toBe(2);
  await page.getByRole('slider', { name: 'LUT intensity', exact: true }).press('Home');
  await page.getByRole('button', { name: 'Enable LUT', exact: true }).click();
  expect(await count()).toBe(2);
  await page.getByRole('button', { name: 'Remove selected LUT', exact: true }).click();
  expect(await count()).toBe(3);
});
