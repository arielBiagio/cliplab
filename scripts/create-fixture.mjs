// Self-authored geometric footage, dedicated to CC0. No external media is used.
// Requires Playwright Chromium and ffmpeg (or FFMPEG_PATH).
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../e2e/fixtures/test-video.webm', import.meta.url));
mkdirSync(new URL('../e2e/fixtures/', import.meta.url), { recursive: true });
const browser = await chromium.launch();
let frames;
try {
  const page = await browser.newPage();
  frames = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 270;
    const ctx = canvas.getContext('2d');
    const result = [];
    for (let i = 0; i < 24; i++) {
      const sky = ctx.createLinearGradient(0, 0, 0, 270);
      sky.addColorStop(0, '#5a8191');
      sky.addColorStop(0.65, '#d8c9a0');
      sky.addColorStop(1, '#86a085');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 480, 270);
      ctx.fillStyle = '#eee0ad';
      ctx.beginPath();
      ctx.arc(320 + i, 73, 27, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#708b7b';
      ctx.beginPath();
      ctx.moveTo(0, 165);
      ctx.lineTo(150, 85);
      ctx.lineTo(340, 210);
      ctx.lineTo(480, 130);
      ctx.lineTo(480, 270);
      ctx.lineTo(0, 270);
      ctx.fill();
      ctx.fillStyle = '#304d45';
      ctx.beginPath();
      ctx.moveTo(0, 225);
      ctx.lineTo(130, 175);
      ctx.lineTo(270, 216);
      ctx.lineTo(480, 155);
      ctx.lineTo(480, 270);
      ctx.lineTo(0, 270);
      ctx.fill();
      ctx.fillStyle = '#e1e9d1';
      ctx.font = '12px monospace';
      ctx.fillText(`CLIPLAB / TEST FOOTAGE / ${String(i).padStart(2, '0')}`, 20, 246);
      result.push(canvas.toDataURL('image/jpeg', 0.9).split(',')[1]);
    }
    return result;
  });
} finally {
  await browser.close();
}
const encoded = spawnSync(
  process.env.FFMPEG_PATH || 'ffmpeg',
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'image2pipe',
    '-c:v',
    'mjpeg',
    '-framerate',
    '2',
    '-i',
    'pipe:0',
    '-c:v',
    'libvpx-vp9',
    '-pix_fmt',
    'yuv420p',
    '-y',
    output,
  ],
  { input: Buffer.concat(frames.map((frame) => Buffer.from(frame, 'base64'))) },
);
if (encoded.error) throw new Error(`${encoded.error.message}\n${encoded.stderr?.toString() ?? ''}`);
if (encoded.status !== 0) throw new Error(encoded.stderr.toString());
console.log(`Created ${output}`);
