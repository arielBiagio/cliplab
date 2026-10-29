import { expect, test, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BlobSource, Input, MP4, WEBM } from 'mediabunny';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

async function openExport(page: Page, name = 'test-video.webm') {
  await page.goto('/');
  await page.getByLabel('Choose video file', { exact: true }).setInputFiles(fixture(name));
  const trigger = page.getByRole('button', { name: 'Export video', exact: true });
  await expect(trigger).toBeEnabled();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Export video', exact: true });
  await expect(dialog.getByRole('button', { name: 'Start export', exact: true })).toBeEnabled();
  return dialog;
}

async function saveResult(page: Page, info: TestInfo) {
  const link = page.getByRole('link', { name: 'Download video', exact: true });
  await expect(link).toBeVisible({ timeout: 30000 });
  const pending = page.waitForEvent('download');
  await link.click();
  const download = await pending;
  const path = info.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  const bytes = await readFile(path);
  const input = new Input({ source: new BlobSource(new Blob([bytes])), formats: [MP4, WEBM] });
  try {
    const video = await input.getPrimaryVideoTrack();
    expect(video).not.toBeNull();
    return {
      path,
      bytes,
      name: download.suggestedFilename(),
      codec: await video!.getCodecParameterString(),
      width: await video!.getDisplayWidth(),
      height: await video!.getDisplayHeight(),
      duration: await input.computeDuration(),
      hasAudio: !!(await input.getPrimaryAudioTrack()),
    };
  } finally {
    input.dispose();
  }
}

async function expectNeutralExportToMatchPreview(page: Page) {
  const url = await page
    .getByRole('link', { name: 'Download video', exact: true })
    .getAttribute('href');
  const maximum = await page.evaluate(async (url) => {
    const source = document.querySelector('video')!;
    const exported = document.createElement('video');
    try {
      await new Promise<void>((resolve, reject) => {
        exported.onloadeddata = () => resolve();
        exported.onerror = () => reject(new Error('Unable to decode the exported file.'));
        exported.src = url!;
        exported.load();
      });
      const canvas = document.createElement('canvas');
      canvas.width = source.videoWidth;
      canvas.height = source.videoHeight;
      const context = canvas.getContext('2d')!;
      const read = (image: CanvasImageSource) => {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return [0.125, 0.25, 0.5, 0.75].flatMap((ratio) =>
          [
            ...context.getImageData(
              Math.floor(canvas.width * ratio),
              Math.floor(canvas.height / 2),
              1,
              1,
            ).data,
          ].slice(0, 3),
        );
      };
      // Read the actual WebGL preview in the same task before its buffer is discarded.
      source.dispatchEvent(new Event('seeked'));
      const original = read(document.querySelector('canvas.video-canvas') as HTMLCanvasElement);
      const output = read(exported);
      return Math.max(...output.map((value, index) => Math.abs(value - original[index]!)));
    } finally {
      exported.removeAttribute('src');
      exported.load();
    }
  }, url);
  expect(maximum).toBeLessThanOrEqual(4);
}

test('export settings are accessible, preserve playback position and keep shortcuts suspended', async ({
  page,
}) => {
  const dialog = await openExport(page);
  await expect(dialog.getByLabel('Export quality', { exact: true })).toHaveValue('very-high');
  await expect(dialog.getByLabel('Export dithering', { exact: true })).toHaveValue('50');
  await expect(dialog.getByLabel('Include original audio', { exact: true })).toBeDisabled();
  await dialog.getByLabel('Export dithering', { exact: true }).press('Home');
  await expect(dialog.getByLabel('Export dithering', { exact: true })).toHaveValue('0');
  await dialog.getByLabel('Export quality', { exact: true }).selectOption('high');
  const start = dialog.getByRole('button', { name: 'Start export', exact: true });
  await start.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close video export' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(start).toBeFocused();
  const violations = (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  ).violations;
  expect(violations).toEqual([]);
  await page.keyboard.press('ArrowRight');
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBe(
    0,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Export video', exact: true })).toBeFocused();
});

for (const format of ['mp4', 'webm']) {
  test(`exports edited ${format} with original audio locally and invalidates a changed result`, async ({
    page,
  }, info) => {
    const outbound: string[] = [];
    page.on('request', (request) => {
      if (
        /^https?:/.test(request.url()) &&
        (new URL(request.url()).hostname !== '127.0.0.1' || request.method() !== 'GET')
      )
        outbound.push(request.url());
    });
    const dialog = await openExport(page, 'export-av.mp4');
    await dialog.getByRole('button', { name: 'Close video export' }).click();
    await page.getByLabel('Brightness', { exact: true }).fill('150');
    await page.getByLabel('Brightness', { exact: true }).press('Tab');
    await page.locator('video').evaluate((video: HTMLVideoElement) => {
      video.currentTime = 1;
    });
    await expect
      .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.seeking))
      .toBe(false);
    await page.getByRole('button', { name: 'Export video', exact: true }).click();
    await dialog.getByLabel('Export format', { exact: true }).selectOption(format);
    await expect(dialog.getByLabel('Include original audio', { exact: true })).toBeChecked();
    await dialog.getByRole('button', { name: 'Start export', exact: true }).click();
    const result = await saveResult(page, info);
    expect(result.width).toBe(160);
    expect(result.height).toBe(90);
    expect(result.duration).toBeGreaterThan(1.8);
    expect(result.duration).toBeLessThan(2.2);
    expect(result.hasAudio).toBe(true);
    expect(result.bytes.byteLength).toBeGreaterThan(1000);
    expect(result.name).toMatch(new RegExp(`\\.${format}$`));
    expect(
      await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime),
    ).toBeCloseTo(1, 1);
    const previousUrl = await dialog
      .getByRole('link', { name: 'Download video', exact: true })
      .getAttribute('href');
    await dialog.getByLabel('Export quality', { exact: true }).selectOption('high');
    await expect(dialog.getByRole('link', { name: 'Download video', exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(async (url) => {
        try {
          await fetch(url!);
          return false;
        } catch {
          return true;
        }
      }, previousUrl),
    ).toBe(true);
    expect(outbound).toEqual([]);
    await page.screenshot({ path: info.outputPath('export-settings.png') });
  });
}

test('exports a real 10-bit SDR source to a verified 10-bit WebM without audio', async ({
  page,
}, info) => {
  const dialog = await openExport(page, 'export-sdr-10bit.webm');
  await expect(dialog).toContainText('10-bit source');
  await dialog.getByLabel('Export format', { exact: true }).selectOption('webm');
  await dialog.getByLabel('Export bit depth', { exact: true }).selectOption('10');
  await dialog.getByLabel('Export dithering', { exact: true }).fill('0');
  await dialog.getByRole('button', { name: 'Start export', exact: true }).click();
  const result = await saveResult(page, info);
  expect(result.codec?.split('.')[3]).toBe('10');
  expect(result.width).toBe(1024);
  expect(result.height).toBe(72);
  expect(result.duration).toBeCloseTo(2, 1);
  expect(result.hasAudio).toBe(false);
  expect(result.name).toContain('-10bit.webm');
  await expectNeutralExportToMatchPreview(page);
});

test('rejects unavailable 10-bit encoders without silently producing an 8-bit file', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = VideoEncoder.isConfigSupported.bind(VideoEncoder);
    VideoEncoder.isConfigSupported = (config) =>
      /^(hvc1\.2|av01\..*\.10|vp09\.02)/.test(config.codec)
        ? Promise.resolve({ supported: false, config })
        : original(config);
  });
  const dialog = await openExport(page);
  await dialog.getByLabel('Export bit depth', { exact: true }).selectOption('10');
  await dialog.getByRole('button', { name: 'Start export', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No compatible 10-bit');
  await expect(dialog.getByRole('link', { name: 'Download video', exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('Export bit depth', { exact: true })).toBeEnabled();
});

test('exports a 10-bit HEVC source through the available decoder without losing output depth', async ({
  page,
}, info) => {
  await page.goto('/');
  const input = new Input({
    source: new BlobSource(new Blob([await readFile(fixture('export-sdr-10bit.mp4'))])),
    formats: [MP4],
  });
  let supported: boolean | undefined;
  try {
    const track = await input.getPrimaryVideoTrack();
    const config = await track!.getDecoderConfig();
    const description = config?.description;
    const bytes = description
      ? ArrayBuffer.isView(description)
        ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
        : new Uint8Array(description)
      : undefined;
    supported = await page.evaluate(
      async ({ config, description }) => {
        try {
          return (
            await VideoDecoder.isConfigSupported({
              ...config!,
              description: description ? new Uint8Array(description) : undefined,
            })
          ).supported;
        } catch {
          return false;
        }
      },
      { config: { ...config!, description: undefined }, description: bytes ? [...bytes] : null },
    );
  } finally {
    input.dispose();
  }
  test.skip(
    !supported,
    'This browser does not expose an HEVC decoder. Covered in native Chrome/Edge QA where available.',
  );
  const dialog = await openExport(page, 'export-sdr-10bit.mp4');
  await dialog.getByLabel('Export format', { exact: true }).selectOption('webm');
  await dialog.getByLabel('Export bit depth', { exact: true }).selectOption('10');
  await dialog.getByLabel('Export dithering', { exact: true }).fill('0');
  await dialog.getByRole('button', { name: 'Start export', exact: true }).click();
  const result = await saveResult(page, info);
  expect(result.codec?.split('.')[3]).toBe('10');
  expect(result.width).toBe(1024);
  expect(result.height).toBe(72);
  await expectNeutralExportToMatchPreview(page);
});

test('detects HDR and explains the SDR-only 10-bit scope', async ({ page }) => {
  const dialog = await openExport(page, 'export-hdr-10bit.webm');
  await expect(dialog).toContainText('HDR');
  await expect(
    dialog.getByLabel('Export bit depth', { exact: true }).locator('option[value="10"]'),
  ).toHaveJSProperty('disabled', true);
  await expect(dialog.getByLabel('Export bit depth', { exact: true })).toHaveValue('8');
  await expect(dialog).toContainText('not available yet');
});

test('exports 10-bit WebM with audio through float rendering and can omit audio in 8-bit', async ({
  page,
}, info) => {
  const dialog = await openExport(page, 'export-av.mp4');
  await dialog.getByLabel('Export format', { exact: true }).selectOption('webm');
  await dialog.getByLabel('Export bit depth', { exact: true }).selectOption('10');
  await dialog.getByRole('button', { name: 'Start export', exact: true }).click();
  const tenBit = await saveResult(page, info);
  expect(tenBit.codec?.split('.')[3]).toBe('10');
  expect(tenBit.hasAudio).toBe(true);
  expect(tenBit.duration).toBeGreaterThan(1.8);
  await dialog.getByLabel('Export bit depth', { exact: true }).selectOption('8');
  await dialog.getByLabel('Include original audio', { exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Start export', exact: true }).click();
  const silent = await saveResult(page, info);
  expect(silent.hasAudio).toBe(false);
});

test('cancels during preparation, releases the pending import and allows retry', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/exportTenBitVideo-*.js', async (route) => {
    await held;
    await route.continue();
  });
  const dialog = await openExport(page);
  await dialog.getByLabel('Export bit depth', { exact: true }).selectOption('10');
  await dialog.getByRole('button', { name: 'Start export', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel export', exact: true }).click();
  release();
  await expect(dialog.getByRole('status').filter({ hasText: 'Export canceled' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Download video', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Start export', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Close video export', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeEnabled();
});

test('keeps preview and timeline in fullscreen and opens export inside that element', async ({
  page,
}) => {
  await openExport(page);
  await page.getByRole('button', { name: 'Close video export', exact: true }).click();
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exit fullscreen', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => {
      const fullscreen = document.fullscreenElement;
      return (
        !!fullscreen?.contains(document.querySelector('video')) &&
        !!fullscreen.contains(document.querySelector('.timeline-panel'))
      );
    }),
  ).toBe(true);
  await page.getByRole('button', { name: 'Export video', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Export video', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      document.fullscreenElement?.contains(document.querySelector('.export-dialog')),
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Close video export', exact: true }).click();
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});
