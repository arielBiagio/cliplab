import { VideoSample } from 'mediabunny';
import type { FloatVideoFrame } from '../rendering/videoRenderer';
import { isHdrTransfer } from './videoColorSpace';

type FloatCanvasSettings = CanvasRenderingContext2DSettings & { colorType: 'float16' };
type FloatImageSettings = ImageDataSettings & { pixelFormat: 'rgba-float16' };

export function createFloatFrameReader(width: number, height: number) {
  const pixels = new Float32Array(width * height * 4);
  let copiedBytes = new Uint8Array(0);
  let canvasReader: ReturnType<typeof createCanvasFrameReader> | null = null;
  return async (sample: VideoSample): Promise<FloatVideoFrame> => {
    if (isHdrTransfer(sample.colorSpace.transfer))
      throw new Error('10-bit HDR export is not available yet. This mode requires SDR footage.');
    if (sample.format && /^I4(20|22|44)A?P1[02]$/.test(sample.format)) {
      const size = sample.allocationSize();
      if (copiedBytes.length !== size) copiedBytes = new Uint8Array(size);
      return readPlanarFrame(sample, width, height, pixels, copiedBytes);
    }
    canvasReader ??= createCanvasFrameReader(width, height, pixels);
    return canvasReader(sample);
  };
}

/** Read original YUV code values without asking the browser to convert them into RGB8. */
async function readPlanarFrame(
  sample: VideoSample,
  width: number,
  height: number,
  pixels: Float32Array<ArrayBuffer>,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<FloatVideoFrame> {
  const { matrix, transfer, primaries, fullRange } = sample.colorSpace;
  if (
    (primaries && primaries !== 'bt709') ||
    (transfer && !['bt709', 'smpte170m', 'iec61966-2-1'].includes(transfer))
  )
    throw new Error(
      'Direct 10-bit processing currently supports BT.709 SDR sources. This source needs a different color-space conversion.',
    );
  if (matrix && !['bt709', 'bt470bg', 'smpte170m'].includes(matrix))
    throw new Error('This source uses a color matrix that is not supported by 10-bit export yet.');
  const layouts = await sample.copyTo(bytes);
  if (layouts.length < 3) throw new Error('The decoder did not provide three readable YUV planes.');
  const values = new DataView(bytes.buffer);
  const sourceWidth = sample.visibleRect.width;
  const sourceHeight = sample.visibleRect.height;
  const subX = sample.format!.startsWith('I444') ? 1 : 2;
  const subY = sample.format!.startsWith('I420') ? 2 : 1;
  const planeWidths = [sourceWidth, Math.ceil(sourceWidth / subX), Math.ceil(sourceWidth / subX)];
  const planeHeights = [
    sourceHeight,
    Math.ceil(sourceHeight / subY),
    Math.ceil(sourceHeight / subY),
  ];
  const readPlane = (plane: number, nx: number, ny: number) => {
    const planeWidth = planeWidths[plane]!;
    const planeHeight = planeHeights[plane]!;
    const x = Math.max(0, Math.min(planeWidth - 1, nx * planeWidth - 0.5));
    const y = Math.max(0, Math.min(planeHeight - 1, ny * planeHeight - 0.5));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, planeWidth - 1);
    const y1 = Math.min(y0 + 1, planeHeight - 1);
    const layout = layouts[plane]!;
    const topOffset = layout.offset + y0 * layout.stride;
    const bottomOffset = layout.offset + y1 * layout.stride;
    const weight = x - x0;
    const top =
      values.getUint16(topOffset + x0 * 2, true) * (1 - weight) +
      values.getUint16(topOffset + x1 * 2, true) * weight;
    const bottom =
      values.getUint16(bottomOffset + x0 * 2, true) * (1 - weight) +
      values.getUint16(bottomOffset + x1 * 2, true) * weight;
    return top * (1 - (y - y0)) + bottom * (y - y0);
  };
  const bits = sample.format!.endsWith('P12') ? 12 : 10;
  const codeScale = 2 ** (bits - 8);
  const maximum = 2 ** bits - 1;
  const yOffset = fullRange ? 0 : 16 * codeScale;
  const yRange = fullRange ? maximum : 219 * codeScale;
  const cRange = fullRange ? maximum : 224 * codeScale;
  const cOffset = 128 * codeScale;
  const kr = matrix === 'bt470bg' || matrix === 'smpte170m' ? 0.299 : 0.2126;
  const kb = matrix === 'bt470bg' || matrix === 'smpte170m' ? 0.114 : 0.0722;
  const scale = Math.min(width / sample.displayWidth, height / sample.displayHeight);
  const drawWidth = sample.displayWidth * scale;
  const drawHeight = sample.displayHeight * scale;
  const left = (width - drawWidth) / 2;
  const top = (height - drawHeight) / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      let nx = (x + 0.5 - left) / drawWidth;
      let ny = (y + 0.5 - top) / drawHeight;
      pixels[offset + 3] = 1;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
        continue;
      }
      if (sample.flip) nx = 1 - nx;
      const beforeRotationX = nx;
      if (sample.rotation === 90) {
        nx = ny;
        ny = 1 - beforeRotationX;
      } else if (sample.rotation === 180) {
        nx = 1 - nx;
        ny = 1 - ny;
      } else if (sample.rotation === 270) {
        nx = 1 - ny;
        ny = beforeRotationX;
      }
      const luma = (readPlane(0, nx, ny) - yOffset) / yRange;
      const u = (readPlane(1, nx, ny) - cOffset) / cRange;
      const v = (readPlane(2, nx, ny) - cOffset) / cRange;
      const r = luma + 2 * (1 - kr) * v;
      const b = luma + 2 * (1 - kb) * u;
      pixels[offset] = r;
      pixels[offset + 1] = (luma - kr * r - kb * b) / (1 - kr - kb);
      pixels[offset + 2] = b;
    }
  }
  return { width, height, pixels, transfer: transfer === 'iec61966-2-1' ? 'srgb' : 'bt709' };
}

/** Require real float storage when the decoder supplies an RGB / opaque frame. */
function createCanvasFrameReader(width: number, height: number, pixels: Float32Array<ArrayBuffer>) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const contextSettings: FloatCanvasSettings = {
    alpha: false,
    colorSpace: 'srgb',
    colorType: 'float16',
    // Keep GPU-backed source frames on the graphics path until explicit float16 readback.
    willReadFrequently: false,
  };
  const context = canvas.getContext('2d', contextSettings);
  const attributes = context?.getContextAttributes() as FloatCanvasSettings | undefined;
  if (!context || attributes?.colorType !== 'float16' || attributes.colorSpace !== 'srgb')
    throw new Error(
      '10-bit export requires float16 canvas support. Update Chrome or Edge, or select 8-bit.',
    );
  const settings: FloatImageSettings = { colorSpace: 'srgb', pixelFormat: 'rgba-float16' };
  function readImage() {
    const image = context!.getImageData(0, 0, width, height, settings);
    const floatImage = image as unknown as {
      data: ArrayLike<number> & { BYTES_PER_ELEMENT: number };
      pixelFormat?: string;
      colorSpace: string;
    };
    const data = floatImage.data;
    if (
      data.BYTES_PER_ELEMENT !== 2 ||
      floatImage.pixelFormat !== 'rgba-float16' ||
      floatImage.colorSpace !== 'srgb'
    )
      throw new Error(
        'This browser reduced canvas readback to 8-bit. Select 8-bit export or update your browser.',
      );
    return data;
  }
  readImage();
  return (sample: VideoSample): FloatVideoFrame => {
    if (isHdrTransfer(sample.colorSpace.transfer))
      throw new Error(
        '10-bit HDR export is not available yet. This mode requires SDR footage; HDR needs a separate color pipeline.',
      );
    context.fillStyle = 'black';
    context.fillRect(0, 0, width, height);
    const scale = Math.min(width / sample.displayWidth, height / sample.displayHeight);
    const drawWidth = sample.displayWidth * scale;
    const drawHeight = sample.displayHeight * scale;
    // Draw the original decoded frame directly: no intermediate 8-bit canvas or ImageBitmap.
    sample.draw(context, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    const data = readImage();
    for (let index = 0; index < pixels.length; index++) pixels[index] = data[index]!;
    return { width, height, pixels };
  };
}

/** Pack BT.709 gamma-encoded float RGB into limited-range planar YUV 4:2:0, 10-bit. */
export function makeTenBitSample(
  rgb: Float32Array<ArrayBuffer>,
  width: number,
  height: number,
  timestamp: number,
  duration: number,
) {
  const lumaSize = width * height;
  const chromaSize = lumaSize / 4;
  const data = new Uint16Array(lumaSize + 2 * chromaSize);
  const quantize = (value: number, minimum: number, maximum: number) =>
    Math.max(minimum, Math.min(maximum, Math.round(value)));
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      let u = 0;
      let v = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const pixel = (y + dy) * width + x + dx;
          const offset = pixel * 4;
          const r = rgb[offset]!;
          const g = rgb[offset + 1]!;
          const b = rgb[offset + 2]!;
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          data[pixel] = quantize(64 + 876 * luma, 64, 940);
          u += (b - luma) / 1.8556;
          v += (r - luma) / 1.5748;
        }
      }
      const chroma = (y / 2) * (width / 2) + x / 2;
      data[lumaSize + chroma] = quantize(512 + (896 * u) / 4, 64, 960);
      data[lumaSize + chromaSize + chroma] = quantize(512 + (896 * v) / 4, 64, 960);
    }
  }
  // WebCodecs specifies little-endian 16-bit storage, with 10 significant low bits.
  if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1)
    throw new Error('10-bit export requires a little-endian platform.');
  return new VideoSample(new Uint8Array(data.buffer), {
    format: 'I420P10',
    codedWidth: width,
    codedHeight: height,
    timestamp,
    duration,
    colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
    layout: [
      { offset: 0, stride: width * 2 },
      { offset: lumaSize * 2, stride: width },
      { offset: (lumaSize + chromaSize) * 2, stride: width },
    ],
  });
}
