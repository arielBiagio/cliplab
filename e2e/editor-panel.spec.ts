import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';

const video = fileURLToPath(new URL('./fixtures/test-video.webm', import.meta.url));
const identity = fileURLToPath(new URL('./fixtures/identity.cube', import.meta.url));
const cycle = fileURLToPath(new URL('./fixtures/channel-cycle.cube', import.meta.url));
async function loadVideo(page: Page) {
  await page.getByLabel('Choose video file', { exact: true }).setInputFiles(video);
  await expect(page.locator('canvas.video-canvas')).toHaveAttribute('data-renderer', 'webgl2');
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('folds Light and Color with pointer and keyboard while edits and history stay separate', async ({
  page,
}) => {
  await loadVideo(page);
  const light = page.locator('details[data-group="light"]');
  const color = page.locator('details[data-group="color"]');
  await expect(light).toHaveAttribute('open', '');
  await expect(color).not.toHaveAttribute('open');
  await light.locator('summary').click();
  await expect(page.getByLabel('Brightness', { exact: true })).not.toBeVisible();
  await color.locator('summary').focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Temperature', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
  expect(await page.locator('video').evaluate((element: HTMLVideoElement) => element.paused)).toBe(
    true,
  );
  await page.getByLabel('Temperature', { exact: true }).press('End');
  await color.locator('summary').click();
  await expect(color.locator('summary')).toContainText('1 edited');
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(page.getByLabel('Temperature', { exact: true })).toHaveValue('0');
  await expect(color).not.toHaveAttribute('open');
  await expect(color.locator('summary')).toContainText('Neutral');
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations).toEqual([]);
});

test('compares a loaded LUT library at the same intensity and frame and clears it for another video', async ({
  page,
}) => {
  await loadVideo(page);
  await page.getByLabel('Choose LUT file', { exact: true }).setInputFiles([identity, cycle]);
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Identity');
  await expect(page.getByRole('list', { name: 'Loaded LUTs' }).getByRole('button')).toHaveCount(2);
  const intensity = page.getByRole('slider', { name: 'LUT intensity', exact: true });
  await intensity.focus();
  for (let index = 0; index < 5; index++) await intensity.press('PageDown');
  await expect(intensity).toHaveValue('50');
  await page.getByRole('button', { name: 'Compare before and after', exact: true }).click();
  const split = page.getByRole('slider', { name: 'Before and after split', exact: true });
  await split.press('ArrowRight');
  await expect(split).toHaveValue('51');
  const canvas = page.locator('canvas.video-canvas');
  await page.locator('#workspace').focus();
  const baseline = await canvas.screenshot();
  await page.getByRole('button', { name: 'Next LUT', exact: true }).click();
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Channel cycle');
  await expect(intensity).toHaveValue('50');
  await expect(split).toHaveValue('51');
  expect((await canvas.screenshot()).equals(baseline)).toBe(false);
  await page.getByRole('button', { name: 'Previous LUT', exact: true }).click();
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Identity');
  expect((await canvas.screenshot()).equals(baseline)).toBe(true);
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Channel cycle');
  await expect(intensity).toHaveValue('50');
  await expect(page.getByRole('list', { name: 'Loaded LUTs' }).getByRole('button')).toHaveCount(2);
  expect(
    await page.locator('video').evaluate((element: HTMLVideoElement) => element.currentTime),
  ).toBe(0);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Loaded LUTs' }).getByRole('button')).toHaveCount(2);
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Channel cycle');
  await expect(intensity).toHaveValue('50');
  await page.getByRole('button', { name: 'Select LUT: Identity', exact: true }).click();
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Identity');
  await loadVideo(page);
  await expect(page.getByRole('list', { name: 'Loaded LUTs' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
});

test('keeps full LUT titles and filenames readable at mobile width and rejects invalid batches atomically', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await loadVideo(page);
  const title = 'Long readable LUT title '.repeat(7).trim();
  const name = 'my-complete-lut-file-name-'.repeat(5) + '.cube';
  const contents = `TITLE "${title}"\nLUT_3D_SIZE 2\n${'0 0 0\n'.repeat(8)}`;
  await page
    .getByLabel('Choose LUT file', { exact: true })
    .setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(contents) });
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText(title);
  await expect(page.locator('.lut-file-name')).toHaveText(name);
  for (const selector of ['.lut-name', '.lut-file-name', '.lut-panel']) {
    expect(
      await page
        .locator(selector)
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
  }
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
  await page.getByLabel('Choose LUT file', { exact: true }).setInputFiles([
    {
      name: 'valid.cube',
      mimeType: 'text/plain',
      buffer: Buffer.from(contents.replace(title, 'Valid')),
    },
    { name: 'broken.cube', mimeType: 'text/plain', buffer: Buffer.from('LUT_1D_SIZE 2') },
  ]);
  await expect(page.getByRole('alert')).toContainText('broken.cube');
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText(title);
  await expect(page.getByRole('list', { name: 'Loaded LUTs' }).getByRole('button')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear gallery', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Loaded LUTs' })).toHaveCount(0);
});

test('selects gallery cards with the keyboard, removes one look and resets adjustments independently', async ({
  page,
}) => {
  await loadVideo(page);
  await expect(page.locator('.lut-panel')).not.toContainText('8 MiB');
  await expect(page.locator('.lut-panel')).not.toContainText('No LUT loaded');
  await page.getByLabel('Choose LUT file', { exact: true }).setInputFiles(
    Array.from({ length: 8 }, (_, index) => ({
      name: `look-${index + 1}.cube`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`TITLE "Look ${index + 1}"\nLUT_3D_SIZE 2\n${'0 0 0\n'.repeat(8)}`),
    })),
  );
  const cards = page.getByRole('list', { name: 'Loaded LUTs' }).getByRole('button');
  await expect(cards).toHaveCount(8);
  await page.getByRole('button', { name: 'Previous LUT', exact: true }).click();
  const last = page.getByRole('button', { name: 'Select LUT: Look 8', exact: true });
  await expect(last).toHaveAttribute('aria-pressed', 'true');
  expect(
    await last.evaluate((element) => {
      const list = element.closest('ul')!.getBoundingClientRect();
      const card = element.getBoundingClientRect();
      return card.top >= list.top - 1 && card.bottom <= list.bottom + 1;
    }),
  ).toBe(true);
  const second = page.getByRole('button', { name: 'Select LUT: Look 2', exact: true });
  await second.focus();
  await second.press('Enter');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  const intensity = page.getByRole('slider', { name: 'LUT intensity', exact: true });
  await intensity.press('PageDown');
  await page.getByRole('button', { name: 'Remove selected LUT', exact: true }).click();
  await expect(second).toHaveCount(0);
  await expect(cards).toHaveCount(7);
  await expect(
    page.getByRole('button', { name: 'Select LUT: Look 3', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(intensity).toHaveValue('90');
  await page.getByLabel('Brightness', { exact: true }).press('End');
  const toggle = page.getByRole('button', { name: 'Enable LUT', exact: true });
  await toggle.click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('100');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(intensity).toHaveValue('90');
  await expect(cards).toHaveCount(7);
  await expect(
    page.getByRole('button', { name: 'Select LUT: Look 3', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Clear gallery', exact: true }).click();
  await expect(cards).toHaveCount(0);
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations).toEqual([]);
});
