import type { CubeLut, Rgb } from './types';

export const MAX_LUT_BYTES = 8 * 1024 * 1024;
export const MAX_LUT_SIZE = 65;
export const MAX_LUT_OUTPUT = 65504;
export const LUT_SIZE_ERROR = 'LUT files must be 8 MiB or smaller.';
const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

export function parseCube(text: string, filename: string): CubeLut {
  if (text.length > MAX_LUT_BYTES || new TextEncoder().encode(text).byteLength > MAX_LUT_BYTES)
    throw new Error(LUT_SIZE_ERROR);
  let name = filename;
  let size = 0;
  let data: Float32Array | null = null;
  let offset = 0;
  let domainMin: Rgb = [0, 0, 0];
  let domainMax: Rgb = [1, 1, 1];
  const headers = new Set<string>();
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);

  function fail(line: number, message: string): never {
    throw new Error(`Line ${line + 1}: ${message}`);
  }
  function triple(parts: string[], line: number): [number, number, number] {
    if (parts.length !== 3 || parts.some((part) => !numberPattern.test(part)))
      fail(line, 'Expected three finite decimal numbers.');
    const values = parts.map(Number);
    if (values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e37))
      fail(line, 'Numbers must be finite and within the supported range.');
    return values as [number, number, number];
  }

  for (let line = 0; line < lines.length; line++) {
    const content = lines[line].trim();
    if (!content || content.startsWith('#')) continue;
    const parts = content.split(/\s+/);
    const keyword = parts[0];
    if (/^[A-Za-z_]/.test(keyword)) {
      if (offset) fail(line, 'Headers must come before table values.');
      if (headers.has(keyword)) fail(line, `Duplicate ${keyword} header.`);
      headers.add(keyword);
      switch (keyword) {
        case 'TITLE': {
          const title = /^TITLE\s+"([^"\r\n]*)"\s*$/.exec(content);
          if (!title || title[1].length > 240)
            fail(line, 'TITLE must be quoted and at most 240 characters.');
          name = title[1].trim() || filename;
          break;
        }
        case 'LUT_3D_SIZE':
          if (parts.length !== 2 || !/^\d+$/.test(parts[1])) fail(line, 'Invalid LUT_3D_SIZE.');
          size = Number(parts[1]);
          if (size < 2 || size > MAX_LUT_SIZE)
            fail(line, `Supported 3D LUT sizes are 2–${MAX_LUT_SIZE} per axis.`);
          data = new Float32Array(size ** 3 * 3);
          break;
        case 'DOMAIN_MIN':
          domainMin = triple(parts.slice(1), line);
          break;
        case 'DOMAIN_MAX':
          domainMax = triple(parts.slice(1), line);
          break;
        case 'LUT_1D_SIZE':
          fail(line, '1D and combined shaper LUTs are not supported. Choose a 3D .cube LUT.');
          break;
        default:
          fail(line, `Unsupported header ${keyword}. Choose a standard 3D .cube LUT.`);
      }
    } else {
      if (!data) fail(line, 'LUT_3D_SIZE must appear before table values.');
      const values = triple(parts, line);
      // Keep overshoot until the shader's final output clamp, but prevent half-float overflow.
      if (values.some((value) => Math.abs(value) > MAX_LUT_OUTPUT))
        fail(
          line,
          `LUT output values must be between -${MAX_LUT_OUTPUT} and ${MAX_LUT_OUTPUT} for the graphics preview.`,
        );
      if (offset + 3 > data.length) fail(line, `Expected exactly ${size ** 3} RGB rows.`);
      data.set(values, offset);
      offset += 3;
    }
  }
  if (!data || offset !== data.length)
    throw new Error(
      size ? `Expected exactly ${size ** 3} RGB rows.` : 'Missing LUT_3D_SIZE header.',
    );
  if (domainMin.some((value, channel) => domainMax[channel] <= value))
    throw new Error('Each DOMAIN_MAX value must be greater than DOMAIN_MIN.');
  // Preserve a meaningful range when uniforms are rounded to 32-bit GPU floats.
  if (domainMin.some((value, channel) => Math.fround(domainMax[channel]) <= Math.fround(value)))
    throw new Error('The LUT input domain is too narrow for this preview.');
  return { name, fileName: filename, size, domainMin, domainMax, data };
}
