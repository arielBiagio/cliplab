import { describe, expect, it } from 'vitest';
import { addToLutLibrary, LUT_LIBRARY_LIMIT } from './lutLibrary';
import type { CubeLut } from './types';

function lut(name: string): CubeLut {
  return {
    name,
    fileName: `${name}.cube`,
    size: 2,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data: new Float32Array(24),
  };
}
describe('session LUT library', () => {
  it('reuses identical imports and shares the existing table rather than duplicating buffers', () => {
    const original = lut('Look');
    const next = addToLutLibrary([original], [lut('Look'), lut('Other')]);
    expect(next.library).toHaveLength(2);
    expect(next.selected[0]).toBe(original);
    expect(next.selected[0].data).toBe(original.data);
  });
  it('keeps same-name files distinct if their data or domain changed', () => {
    const original = lut('Look');
    const updated = lut('Look');
    updated.data[0] = 0.25;
    const domain = { ...lut('Look'), domainMax: [2, 2, 2] as const };
    expect(addToLutLibrary([original], [updated, domain]).library).toHaveLength(3);
  });
  it('rejects a full library without changing it and allows duplicates at capacity', () => {
    const original = Array.from({ length: LUT_LIBRARY_LIMIT }, (_, index) => lut(`Look ${index}`));
    expect(() => addToLutLibrary(original, [lut('New')])).toThrow('clear the gallery');
    expect(original).toHaveLength(LUT_LIBRARY_LIMIT);
    expect(addToLutLibrary(original, [lut('Look 0')]).selected[0]).toBe(original[0]);
  });
});
