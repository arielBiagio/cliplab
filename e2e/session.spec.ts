import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/test-video.webm', import.meta.url));
const lut = fileURLToPath(new URL('./fixtures/channel-cycle.cube', import.meta.url));

test('restores footage, edits, LUT and paused position while starting with empty undo history', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Choose video file', { exact: true }).setInputFiles(fixture);
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Vintage', exact: true }).click();
  await page.getByLabel('Choose LUT file', { exact: true }).setInputFiles(lut);
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Channel cycle');
  await page.locator('video').evaluate((video: HTMLVideoElement) => {
    video.currentTime = 5;
  });
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.seeking))
    .toBe(false);
  await expect(page.locator('.session-storage')).toHaveAttribute('data-save-state', 'saved');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('110');
  await expect(page.locator('.lut-card.is-selected .lut-name')).toHaveText('Channel cycle');
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeCloseTo(5, 1);
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(
    true,
  );
});

test('clears the saved session while keeping current work, then refreshes empty', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Choose video file', { exact: true }).setInputFiles(fixture);
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Vintage', exact: true }).click();
  await expect(page.locator('.session-storage')).toHaveAttribute('data-save-state', 'saved');
  await page.getByRole('button', { name: 'Clear saved session', exact: true }).click();
  await expect(page.locator('.session-storage')).toHaveAttribute('data-save-state', 'unsaved');
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('110');
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('100');
});
