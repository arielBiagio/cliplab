import { describe, expect, it } from 'vitest';
import { parseCube, MAX_LUT_BYTES, MAX_LUT_OUTPUT } from './parseCube';

const rows = '0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1';
const cube = `LUT_3D_SIZE 2\n${rows}`;

describe('Cube import', () => {
  it('reads red-fastest RGB rows, BOM, CRLF, comments, scientific notation and optional domains', () => {
    const lut = parseCube(
      `\uFEFF# own LUT\r\nTITLE "My look"\r\nDOMAIN_MIN -0.1 0 0\r\nDOMAIN_MAX 1.1 1 1\r\n${cube.replace('1 0 0', '1e0 0.0 .0')}`,
      'look.cube',
    );
    expect(lut).toMatchObject({
      name: 'My look',
      size: 2,
      domainMin: [-0.1, 0, 0],
      domainMax: [1.1, 1, 1],
    });
    expect(Array.from(lut.data.slice(3, 9))).toEqual([1, 0, 0, 0, 1, 0]);
    expect(lut.data.length).toBe(24);
  });

  it('uses the filename and unit domain by default', () => {
    expect(parseCube(cube, 'look.cube')).toMatchObject({
      name: 'look.cube',
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
    });
  });

  it('accepts a 65-point cube without truncating the table', () => {
    const lut = parseCube(`LUT_3D_SIZE 65\n${'0.25 0.5 0.75\n'.repeat(65 ** 3)}`, 'large.cube');
    expect(lut.data.length).toBe(65 ** 3 * 3);
    expect(Array.from(lut.data.slice(-3))).toEqual([0.25, 0.5, 0.75]);
  });

  it.each([
    ['', 'Missing LUT_3D_SIZE'],
    [rows, 'before table values'],
    [`LUT_3D_SIZE 1\n${rows}`, '2–65'],
    [`LUT_3D_SIZE 66\n${rows}`, '2–65'],
    [`LUT_3D_SIZE 2.5\n${rows}`, 'Invalid LUT_3D_SIZE'],
    [`LUT_1D_SIZE 2\n${rows}`, '1D and combined'],
    [`LUT_3D_INPUT_RANGE 0 1\n${cube}`, 'Unsupported header'],
    [`LUT_3D_SIZE 2\n${cube}`, 'Duplicate'],
    [cube + '\n0 0 0', 'exactly 8'],
    [cube.slice(0, cube.lastIndexOf('\n')), 'exactly 8'],
    [cube.replace('0 0 0', '0 0'), 'three finite'],
    [cube.replace('0 0 0', '0 NaN 0'), 'three finite'],
    [cube.replace('0 0 0', '0 0xFF 0'), 'three finite'],
    [cube.replace('0 0 0', '0 1e999 0'), 'finite'],
    [cube.replace('0 0 0', '0 -65505 0'), '-65504'],
    [cube.replace('0 0 0', '65505 0 0'), '65504'],
    ['TITLE Unquoted\n' + cube, 'quoted'],
    [cube + '\nTITLE "Late"', 'before table'],
    ['DOMAIN_MAX 0 1 1\n' + cube, 'greater than'],
    ['DOMAIN_MIN 1 0 0\nDOMAIN_MAX 1.000000001 1 1\n' + cube, 'too narrow'],
  ])('rejects malformed or unsupported input (%#)', (text, message) => {
    expect(() => parseCube(text, 'broken.cube')).toThrow(message);
  });

  it('bounds file size before allocating a table', () => {
    expect(() => parseCube(' '.repeat(MAX_LUT_BYTES + 1), 'large.cube')).toThrow('8 MiB');
  });

  it('preserves signed and above-one output entries, including half-float limits', () => {
    const lut = parseCube(
      cube
        .replace('0 0 0', '-0.25 1.5 2')
        .replace('1 0 0', `-${MAX_LUT_OUTPUT} ${MAX_LUT_OUTPUT} 0`),
      'extended.cube',
    );
    expect(Array.from(lut.data.slice(0, 6))).toEqual([-0.25, 1.5, 2, -65504, 65504, 0]);
  });

  it('accepts exactly 8 MiB and measures UTF-8 bytes rather than character count', () => {
    const prefix = cube + '\n#';
    expect(
      parseCube(prefix + ' '.repeat(MAX_LUT_BYTES - prefix.length), 'boundary.cube').size,
    ).toBe(2);
    // Each accented character is two UTF-8 bytes, despite taking one JS code unit.
    const tooManyBytes = prefix + 'é'.repeat(Math.ceil((MAX_LUT_BYTES - prefix.length) / 2) + 1);
    expect(tooManyBytes.length).toBeLessThan(MAX_LUT_BYTES);
    expect(() => parseCube(tooManyBytes, 'multibyte.cube')).toThrow('8 MiB');
  });
});
