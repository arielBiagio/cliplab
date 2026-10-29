// Self-authored synthetic footage, dedicated to CC0. Requires FFmpeg with libx265/libvpx.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ramp =
  'nullsrc=size=1024x72:rate=6:duration=2,format=yuv420p10le,geq=lum=64+876*X/(W-1):cb=512:cr=512';
const sdr = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];
const cases = [
  [
    'export-av.mp4',
    [
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=160x90:rate=6:duration=2',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000:duration=2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      ...sdr,
    ],
  ],
  [
    'export-sdr-10bit.webm',
    ['-f', 'lavfi', '-i', ramp, '-c:v', 'libvpx-vp9', '-profile:v', '2', '-lossless', '1', ...sdr],
  ],
  [
    'export-sdr-10bit.mp4',
    [
      '-f',
      'lavfi',
      '-i',
      `${ramp},setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709`,
      '-c:v',
      'libx265',
      '-x265-params',
      'log-level=error:pools=1:frame-threads=1:lossless=1',
      '-tag:v',
      'hvc1',
      ...sdr,
    ],
  ],
  [
    'export-hdr-10bit.webm',
    [
      '-f',
      'lavfi',
      '-i',
      `${ramp},setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc`,
      '-c:v',
      'libvpx-vp9',
      '-profile:v',
      '2',
      '-lossless',
      '1',
      '-color_primaries',
      'bt2020',
      '-color_trc',
      'smpte2084',
      '-colorspace',
      'bt2020nc',
    ],
  ],
];
for (const [name, args] of cases) {
  const path = fileURLToPath(new URL(`../e2e/fixtures/${name}`, import.meta.url));
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args, '-y', path], {
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr);
  console.log(`Created ${name}`);
}
