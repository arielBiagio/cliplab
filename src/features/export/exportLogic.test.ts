import { describe, expect, it } from 'vitest';
import { VideoSample } from 'mediabunny';
import { exportDimensions } from './exportShared';
import { createFloatFrameReader, makeTenBitSample } from './tenBitFrames';
import { isHdrTransfer } from './videoColorSpace';

describe('export dimensions', () => {
  it.each([
    [3840, 2160, 1080, 1920, 1080],
    [2160, 3840, 1080, 1080, 1920],
    [3840, 2160, 720, 1280, 720],
    [2160, 3840, 720, 720, 1280],
    [481, 271, 1080, 480, 270],
  ] as const)(
    'fits %ix%i into %ip with even dimensions and no upscaling',
    (width, height, resolution, expectedWidth, expectedHeight) => {
      expect(exportDimensions(width, height, resolution)).toEqual({
        width: expectedWidth,
        height: expectedHeight,
      });
    },
  );
});

describe('10-bit frames', () => {
  it.each([
    [0, 64],
    [0.5, 502],
    [1, 940],
  ] as const)(
    'encodes neutral %f as legal-range luma %i with neutral chroma',
    async (value, expectedLuma) => {
      const pixels = new Float32Array(
        Array.from({ length: 4 }, () => [value, value, value, 1]).flat(),
      );
      const sample = makeTenBitSample(pixels, 2, 2, 1.5, 0.25);
      try {
        expect(sample.format).toBe('I420P10');
        expect(sample.timestamp).toBe(1.5);
        expect(sample.duration).toBe(0.25);
        const bytes = new Uint8Array(sample.allocationSize());
        await sample.copyTo(bytes);
        expect([...new Uint16Array(bytes.buffer)]).toEqual([
          expectedLuma,
          expectedLuma,
          expectedLuma,
          expectedLuma,
          512,
          512,
        ]);
        expect(sample.colorSpace.transfer).toBe('bt709');
        expect(sample.colorSpace.fullRange).toBe(false);
      } finally {
        sample.close();
      }
    },
  );

  it('reads adjacent 10-bit values distinctly and respects clockwise rotation', async () => {
    const codes = new Uint16Array([400, 401, 402, 403, 512, 512]);
    const sample = new VideoSample(new Uint8Array(codes.buffer), {
      format: 'I420P10',
      codedWidth: 2,
      codedHeight: 2,
      rotation: 90,
      timestamp: 0,
      colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
    });
    try {
      const result = await createFloatFrameReader(2, 2)(sample);
      expect(result.transfer).toBe('bt709');
      const expected = [402, 400, 403, 401];
      for (let index = 0; index < 4; index++) {
        expect(result.pixels[index * 4]).toBeCloseTo((expected[index]! - 64) / 876, 6);
        expect(result.pixels[index * 4 + 1]).toBeCloseTo(result.pixels[index * 4]!, 6);
      }
    } finally {
      sample.close();
    }
  });
});

describe('HDR guard', () => {
  it.each(['pq', 'hlg', 'smpte2084', 'arib-std-b67'])(
    'recognizes %s and blocks the SDR frame processor',
    async (transfer) => {
      expect(isHdrTransfer(transfer)).toBe(true);
      const sample = { colorSpace: { transfer } } as unknown as VideoSample;
      await expect(createFloatFrameReader(2, 2)(sample)).rejects.toThrow('HDR');
    },
  );
  it.each(['bt709', 'smpte170m', 'iec61966-2-1', undefined, null])(
    'keeps SDR transfer %s eligible',
    (transfer) => {
      expect(isHdrTransfer(transfer)).toBe(false);
    },
  );
});
